import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTransientState, useProjectStore } from '@/store/useProjectStore';
import { CAMERA_TRACK_ID, createProject, toProjectDocument } from '@/store/projectDocument';
import { clearHistory, getHistoryEntries } from '@/store/history';
import { createBoundaryItem, createCameraKeyframe } from '@/store/itemFactories';
import type { FrameToShell } from '../protocol';
import { makeGlb } from '@/models/testGlb';
import { readModelFile } from '@/models/glb';
import { clearModelRegistry, isModelReady } from '@/models/modelRegistry';
import { installModelRetention } from '@/models/modelRetention';
import type { Project } from '@/store/types';
import { DemoDriver } from './driver';
import { missingModels, parseDemoFile } from './session';
import { projectAspect, startingCamera, startingProject } from './startState';

const glb = (max: [number, number, number]) => makeGlb({ nodes: [{ mesh: 0 }], min: [0, 0, 0], max });
const glbFile = (name: string, max: [number, number, number] = [1, 2, 3]) => new File([glb(max)], name);

async function fileWithModel(): Promise<Project> {
  const read = await readModelFile(glbFile('Tower.glb'));
  const boundary = createBoundaryItem({ placeName: 'France', geojson: null, startTime: 1, id: 'b1' });
  const camera = {
    kind: 'camera' as const,
    id: CAMERA_TRACK_ID,
    keyframes: [
      createCameraKeyframe({ time: 4, center: [5, 45], zoom: 6, id: 'k2' }),
      createCameraKeyframe({ time: 0, center: [2.35, 48.85], zoom: 5, pitch: 30, bearing: 10, id: 'k1' }),
    ],
  };
  return createProject({
    name: 'Tour de France',
    aspectRatio: '1:1',
    exportResolution: '1080p',
    resolution: [1080, 1080],
    mapCenter: [2.35, 48.85],
    mapStyle: 'dark',
    items: { [CAMERA_TRACK_ID]: camera, b1: boundary },
    itemOrder: [CAMERA_TRACK_ID, 'b1'],
    models: {
      m1: { id: 'm1', fileName: 'Tower.glb', byteSize: read.byteSize, sha256: read.sha256, bounds: read.bounds },
    },
  });
}

const jsonOf = (project: Project) => JSON.stringify(toProjectDocument(project));

beforeEach(() => {
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() }));
  clearModelRegistry();
  useProjectStore.setState({ ...createProject(), ...createTransientState() });
  clearHistory();
});
afterEach(() => vi.unstubAllGlobals());

describe('starting state', () => {
  it('is an empty project with the file identity, video shape and map centre', async () => {
    const file = await fileWithModel();
    const start = startingProject(file);
    expect(start).toMatchObject({
      id: file.id,
      name: 'Untitled Project',
      aspectRatio: '1:1',
      exportResolution: '1080p',
      resolution: [1080, 1080],
      mapCenter: [2.35, 48.85],
      mapStyle: 'standard',
      itemOrder: [CAMERA_TRACK_ID],
      models: {},
    });
    expect(projectAspect(file)).toBe(1);
  });

  it('opens on the first camera view in time, or the map centre', async () => {
    const file = await fileWithModel();
    expect(startingCamera(file)).toEqual({ center: [2.35, 48.85], zoom: 5, pitch: 30, bearing: 10 });
    expect(startingCamera({ ...file, items: {} })).toEqual({ center: [2.35, 48.85], zoom: 12, pitch: 0, bearing: 0 });
    expect(startingCamera({ ...file, items: {}, mapCenter: [0, 0] })).toBeNull();
  });
});

describe('parseDemoFile', () => {
  it('parses a saved project and reports what is wrong with a bad file', async () => {
    const file = await fileWithModel();
    const ok = parseDemoFile(jsonOf(file));
    expect('project' in ok && ok.project.name).toBe('Tour de France');
    expect(parseDemoFile('{nope')).toEqual({ error: 'The file is not valid JSON.' });
    const bad = parseDemoFile(JSON.stringify({ schemaVersion: 5, id: 'x', name: 'x', items: {} }));
    expect('error' in bad).toBe(true);
  });
});

describe('DemoDriver load, relink and reset', () => {
  it('loads the file, reports it and shows the empty starting project with no history', async () => {
    const file = await fileWithModel();
    const sent: FrameToShell[] = [];
    const driver = new DemoDriver((msg) => sent.push(msg));
    useProjectStore.getState().setProjectName('Something before');

    await driver.handle({ type: 'load', fileName: 'tour.json', json: jsonOf(file) });

    expect(sent).toEqual([
      { type: 'loaded', title: 'Tour de France', aspect: 1, missingModels: [{ modelId: 'm1', name: 'Tower' }] },
      { type: 'state', state: 'ready' },
    ]);
    const state = useProjectStore.getState();
    expect(state).toMatchObject({ id: file.id, name: 'Untitled Project', mapCenter: [2.35, 48.85], itemOrder: [CAMERA_TRACK_ID] });
    expect(getHistoryEntries().past).toHaveLength(0);
  });

  it('reports a file it cannot read', async () => {
    const sent: FrameToShell[] = [];
    const driver = new DemoDriver((msg) => sent.push(msg));
    await driver.handle({ type: 'load', fileName: 'x.json', json: 'not json' });
    expect(sent).toEqual([{ type: 'load-error', message: 'The file is not valid JSON.' }]);
    expect(driver.runState).toBe('empty');
  });

  it('relinks a model with its own file and keeps it in memory before the run uses it', async () => {
    const stopRetention = installModelRetention();
    const file = await fileWithModel();
    const sent: FrameToShell[] = [];
    const driver = new DemoDriver((msg) => sent.push(msg));
    await driver.handle({ type: 'load', fileName: 'tour.json', json: jsonOf(file) });
    sent.length = 0;

    await driver.handle({ type: 'relink-model', modelId: 'm1', file: glbFile('Tower.glb') });
    expect(sent).toEqual([{ type: 'models', missingModels: [] }]);
    // A store change sweeps unused model files; the demo's hold keeps this one.
    useProjectStore.getState().setProjectName('x');
    await Promise.resolve();
    expect(isModelReady(driver.file!.project.models.m1)).toBe(true);
    stopRetention();
  });

  it('uses a different file for a model anyway, taking its details', async () => {
    const file = await fileWithModel();
    const driver = new DemoDriver(() => {});
    await driver.handle({ type: 'load', fileName: 'tour.json', json: jsonOf(file) });
    await driver.handle({ type: 'relink-model', modelId: 'm1', file: glbFile('Other.glb', [5, 5, 5]) });
    const asset = driver.file!.project.models.m1;
    expect(asset).toMatchObject({ id: 'm1', fileName: 'Other.glb', bounds: { max: [5, 5, 5] } });
    expect(missingModels(driver.file!.project)).toEqual([]);
  });

  it('reset goes back to the empty starting project', async () => {
    const file = await fileWithModel();
    const sent: FrameToShell[] = [];
    const driver = new DemoDriver((msg) => sent.push(msg));
    await driver.handle({ type: 'load', fileName: 'tour.json', json: jsonOf(file) });
    useProjectStore.setState({ items: file.items, itemOrder: file.itemOrder, mapStyle: 'dark' });
    await driver.handle({ type: 'reset' });
    expect(useProjectStore.getState()).toMatchObject({ itemOrder: [CAMERA_TRACK_ID], mapStyle: 'standard' });
    expect(getHistoryEntries().past).toHaveLength(0);
  });
});
